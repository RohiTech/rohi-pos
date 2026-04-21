-- Seed de clientes de ejemplo sin membresia.
-- Este script es idempotente: no duplica clientes existentes.

INSERT INTO clients (
  client_code,
  first_name,
  last_name,
  email,
  phone,
  gender,
  join_date,
  notes,
  is_active
)
VALUES
  ('CLI-0201', 'Javier', 'Lopez', 'javier.lopez@demo.local', '8888-2001', 'male', CURRENT_DATE - 20, 'Cliente de rutina diaria sin membresia', TRUE),
  ('CLI-0202', 'Elena', 'Morales', 'elena.morales@demo.local', '8888-2002', 'female', CURRENT_DATE - 16, 'Asiste por sesiones sueltas', TRUE),
  ('CLI-0203', 'Roberto', 'Vargas', 'roberto.vargas@demo.local', '8888-2003', 'male', CURRENT_DATE - 12, 'Pendiente de evaluar plan mensual', TRUE),
  ('CLI-0204', 'Patricia', 'Rojas', 'patricia.rojas@demo.local', '8888-2004', 'female', CURRENT_DATE - 10, 'Prefiere pago diario por flexibilidad', TRUE),
  ('CLI-0205', 'Luis', 'Chavez', 'luis.chavez@demo.local', '8888-2005', 'male', CURRENT_DATE - 8, 'Cliente nuevo sin membresia', TRUE),
  ('CLI-0206', 'Gabriela', 'Mairena', 'gabriela.mairena@demo.local', '8888-2006', 'female', CURRENT_DATE - 7, 'Rutina de tarde, aun sin plan', TRUE),
  ('CLI-0207', 'Fernando', 'Navarro', 'fernando.navarro@demo.local', '8888-2007', 'male', CURRENT_DATE - 6, 'Asistencia intermitente', TRUE),
  ('CLI-0208', 'Carla', 'Pineda', 'carla.pineda@demo.local', '8888-2008', 'female', CURRENT_DATE - 5, 'Pago diario recurrente', TRUE),
  ('CLI-0209', 'Byron', 'Reyes', 'byron.reyes@demo.local', '8888-2009', 'male', CURRENT_DATE - 4, 'Cliente de prueba sin membresia', TRUE),
  ('CLI-0210', 'Natalia', 'Cuevas', 'natalia.cuevas@demo.local', '8888-2010', 'female', CURRENT_DATE - 3, 'Asiste fines de semana', TRUE),
  ('CLI-0211', 'Oscar', 'Gutierrez', 'oscar.gutierrez@demo.local', '8888-2011', 'male', CURRENT_DATE - 2, 'Usuario demo para caja', TRUE),
  ('CLI-0212', 'Daniela', 'Sevilla', 'daniela.sevilla@demo.local', '8888-2012', 'female', CURRENT_DATE - 1, 'Cliente demo sin historial de membresia', TRUE)
ON CONFLICT (client_code) DO NOTHING;
