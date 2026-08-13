"""add billing tables

Revision ID: b2c3d4e5f6g7
Revises: a7b3c9d1e5f2
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, JSON

revision = 'b2c3d4e5f6g7'
down_revision = 'a7b3c9d1e5f2'
branch_labels = None
depends_on = None

# Same predicate as a7b3c9d1e5f2: bound tenant sees its own rows, an unbound
# session sees nothing, and crossing tenants needs the explicit platform grant.
_FAIL_CLOSED = """
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.platform_context', true) = 'on'
"""

_LINE_PREDICATE = """
    EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.id = invoice_lines.invoice_id
          AND (
            inv.tenant_id = current_setting('app.current_tenant', true)
            OR current_setting('app.platform_context', true) = 'on'
          )
    )
"""


def upgrade() -> None:
    # ---- ENUMs ----
    op.execute("""
        CREATE TYPE plan_edition AS ENUM ('education', 'business')
    """)
    op.execute("""
        CREATE TYPE billing_cycle AS ENUM ('annual', 'semester', 'monthly')
    """)
    op.execute("""
        CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled')
    """)
    op.execute("""
        CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'void')
    """)

    # ---- plans (platform-level) ----
    op.create_table(
        'plans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('code', sa.String(50), unique=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('edition', ENUM('education', 'business', name='plan_edition', create_type=False), nullable=False),
        sa.Column('default_billing_cycle', ENUM('annual', 'semester', 'monthly', name='billing_cycle', create_type=False), nullable=False),
        sa.Column('currency', sa.String(10), default='IDR', nullable=False),
        sa.Column('features', JSON, nullable=False),
        sa.Column('is_active', sa.Boolean, default=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # ---- plan_tiers ----
    op.create_table(
        'plan_tiers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('plan_id', sa.String(36), sa.ForeignKey('plans.id', ondelete='CASCADE'), nullable=False),
        sa.Column('min_users', sa.Integer, nullable=False, default=1),
        sa.Column('max_users', sa.Integer, nullable=True),
        sa.Column('unit_price', sa.Integer, nullable=False),
        sa.Column('min_charge', sa.Integer, nullable=False),
        sa.Column('sort_order', sa.Integer, default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('plan_id', 'min_users', 'max_users', name='uq_plan_tier_band'),
    )
    op.create_index('ix_plan_tier_plan', 'plan_tiers', ['plan_id'])

    # ---- tenant_subscriptions ----
    op.create_table(
        'tenant_subscriptions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('plan_id', sa.String(36), sa.ForeignKey('plans.id'), nullable=False),
        sa.Column('billing_cycle', ENUM('annual', 'semester', 'monthly', name='billing_cycle', create_type=False), nullable=False),
        sa.Column('unit_price_override', sa.Integer, nullable=True),
        sa.Column('discount_pct', sa.Float, default=0.0, nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', ENUM('trial', 'active', 'past_due', 'canceled', name='subscription_status', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_tenant_sub_tenant', 'tenant_subscriptions', ['tenant_id'])

    # ---- usage_snapshots ----
    op.create_table(
        'usage_snapshots',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('snapshot_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('active_users', sa.Integer, default=0, nullable=False),
        sa.Column('devices', sa.Integer, default=0, nullable=False),
        sa.Column('punches', sa.Integer, default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('tenant_id', 'snapshot_date', name='uq_usage_tenant_date'),
    )
    op.create_index('ix_usage_tenant_date', 'usage_snapshots', ['tenant_id', 'snapshot_date'])

    # ---- invoices ----
    op.create_table(
        'invoices',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('invoice_number', sa.String(50), unique=True, nullable=False),
        sa.Column('tenant_id', sa.String(36), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('subscription_id', sa.String(36), sa.ForeignKey('tenant_subscriptions.id'), nullable=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('billed_users', sa.Integer, default=0, nullable=False),
        sa.Column('tier_id', sa.String(36), nullable=True),
        sa.Column('subtotal', sa.Integer, default=0, nullable=False),
        sa.Column('discount', sa.Integer, default=0, nullable=False),
        sa.Column('tax_pct', sa.Float, default=0.0, nullable=False),
        sa.Column('tax_amount', sa.Integer, default=0, nullable=False),
        sa.Column('total', sa.Integer, default=0, nullable=False),
        sa.Column('currency', sa.String(10), default='IDR', nullable=False),
        sa.Column('status', ENUM('draft', 'issued', 'paid', 'void', name='invoice_status', create_type=False), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_invoice_tenant', 'invoices', ['tenant_id'])

    # ---- invoice_lines ----
    op.create_table(
        'invoice_lines',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('invoice_id', sa.String(36), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sort_order', sa.Integer, default=0, nullable=False),
        sa.Column('description', sa.String(500), nullable=False),
        sa.Column('qty', sa.Integer, default=1, nullable=False),
        sa.Column('unit_price', sa.Integer, default=0, nullable=False),
        sa.Column('amount', sa.Integer, default=0, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_invoice_line_invoice', 'invoice_lines', ['invoice_id'])

    # ---- Row-Level Security ----
    # `plans` and `plan_tiers` are platform-level (no tenant_id) and stay
    # unguarded on purpose; only super admins reach them. Everything below
    # carries tenant data and must follow the fail-closed posture set by
    # a7b3c9d1e5f2: an unbound session matches zero rows, never every row.
    for table in ('tenant_subscriptions', 'usage_snapshots', 'invoices'):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING ({_FAIL_CLOSED})
            WITH CHECK ({_FAIL_CLOSED})
            """
        )

    # invoice_lines has no tenant_id of its own — it inherits isolation from its
    # parent invoice. The inner SELECT is itself subject to the invoices policy,
    # so an unbound session finds no parent and therefore no lines.
    op.execute("ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON invoice_lines
        USING ({_LINE_PREDICATE})
        WITH CHECK ({_LINE_PREDICATE})
        """
    )

    # Mirrors the explicit grants in b8c9d0e1f2a3 / c9d0e1f2a3b4. ALTER DEFAULT
    # PRIVILEGES already covers new tables, but only for objects created by the
    # role that set it — the explicit grant makes this migration self-contained.
    for table in (
        'plans', 'plan_tiers', 'tenant_subscriptions',
        'usage_snapshots', 'invoices', 'invoice_lines',
    ):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO netra_app")


def downgrade() -> None:
    op.drop_table('invoice_lines')
    op.drop_table('invoices')
    op.drop_table('usage_snapshots')
    op.drop_table('tenant_subscriptions')
    op.drop_table('plan_tiers')
    op.drop_table('plans')

    # Drop ENUMs
    op.execute("DROP TYPE IF EXISTS invoice_status")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS billing_cycle")
    op.execute("DROP TYPE IF EXISTS plan_edition")
