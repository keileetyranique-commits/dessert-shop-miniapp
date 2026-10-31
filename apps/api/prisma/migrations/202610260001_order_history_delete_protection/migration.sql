-- No application/session bypass: destructive archival requires a separately reviewed DBA process.
CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION protect_order_history();
CREATE TRIGGER order_items_no_delete BEFORE DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION protect_order_history();
CREATE TRIGGER order_events_no_delete BEFORE DELETE ON order_events
FOR EACH ROW EXECUTE FUNCTION protect_order_history();
