-- Allow the private reconciliation archive to retain supported Excel sources.
-- Macro-enabled workbooks remain blocked by both client and server validation.
update storage.buckets
set allowed_mime_types = array[
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'reconciliation-files';
