
ALTER TABLE files ADD COLUMN assigned_students jsonb DEFAULT '[]'::jsonb NOT NULL;
