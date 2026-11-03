-- Units can now be deleted when no product uses them (deleteUnit). The table was
-- created without DELETE for app_role; variants_unit_fk still blocks a unit in use.
GRANT DELETE ON TABLE public.units TO app_role;
