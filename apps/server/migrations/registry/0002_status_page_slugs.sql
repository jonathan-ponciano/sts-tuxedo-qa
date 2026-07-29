CREATE TABLE status_page_slugs (
  slug TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE
);
