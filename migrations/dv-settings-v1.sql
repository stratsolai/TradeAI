-- Design Visualiser settings table
-- Stores per-user DV configuration (chatbot access mode)

CREATE TABLE IF NOT EXISTS dv_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  cb_mode text DEFAULT 'off' CHECK (cb_mode IN ('off', 'watermarked', 'full_access')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE dv_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own DV settings"
  ON dv_settings FOR ALL
  USING (auth.uid() = user_id);
