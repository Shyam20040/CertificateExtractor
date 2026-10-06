insert into public.certificates (
  id,
  name,
  certification_name,
  certificate_number,
  issuing_organization,
  issue_date,
  duration,
  skills,
  description,
  file_path,
  file_name,
  created_at,
  updated_at
)
values
  (
    '3a8a4d01-8b53-4b0b-8d0d-2ed6824d7111',
    'Rahul Sharma',
    'Web Development Course',
    'WD-2024-1056',
    'ABC Institute',
    '12 March 2024',
    '3 Months',
    array['HTML', 'CSS', 'JavaScript'],
    'Sample seed record for previewing the certificate library.',
    null,
    null,
    '2024-03-12T10:00:00Z',
    now()
  ),
  (
    '4c34c212-f0d6-4c7e-b874-2b8057bf12ef',
    'Priya Mehta',
    'Data Analysis Certification',
    'DA-2024-2101',
    'ABC Institute',
    '21 January 2024',
    '6 Months',
    array['SQL', 'Data Analysis', 'Visualization'],
    'Sample seed record for previewing the certificate library.',
    null,
    null,
    '2024-01-21T10:00:00Z',
    now()
  ),
  (
    'a9e4c635-1e0f-47d9-88ac-0a49812f2503',
    'Amit Kumar',
    'Python Programming',
    'PY-2023-0615',
    'ABC Institute',
    '15 June 2023',
    '4 Months',
    array['Python', 'Programming'],
    'Sample seed record for previewing the certificate library.',
    null,
    null,
    '2023-06-15T10:00:00Z',
    now()
  )
on conflict (id) do nothing;
