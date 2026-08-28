-- Reconnecting an existing connection in place: the OAuth round-trip carries the
-- connection it must refresh instead of creating a duplicate account row.
ALTER TABLE "connector_oauth_states" ADD COLUMN "connectionId" TEXT;
