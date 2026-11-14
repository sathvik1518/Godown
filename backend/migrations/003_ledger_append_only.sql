-- The stock ledger is a permanent record: rows can be added, never edited or removed.
-- (TRUNCATE is not covered by row triggers, so the demo-data reset still works.)

CREATE FUNCTION forbid_ledger_changes() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_append_only
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_changes();
