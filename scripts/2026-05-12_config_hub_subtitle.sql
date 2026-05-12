-- Seed config hub_subtitle (admin éditable depuis /admin > Paramètres)
INSERT INTO public.config (key, value)
VALUES ('hub_subtitle', 'Tout le village, à portée de main')
ON CONFLICT (key) DO NOTHING;
