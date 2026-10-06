# Certify — Certificate Information Extractor

A React and Express application that reads certificate images and PDFs in the browser, uses Gemini to structure the recognized text, and saves shared certificate records and files in Supabase.

## Requirements

- Node.js 18 or newer
- A Gemini API key for certificate detail extraction
- A Supabase project URL and publishable/anon key

## Getting started

1. Install dependencies from the project root with `npm install`.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the root `.env`. Use the Supabase publishable/anon key only; never put a service-role key in frontend environment variables. Vite reads these variables when it starts.
3. Create/apply the Supabase schema and sample records using the Supabase CLI (see **Create the Supabase table and sample rows** below).
4. Set `GEMINI_API_KEY` in the same `.env`; it is read only by Express and must never use a `VITE_` prefix.
5. Start the client and API with `npm run dev`.
6. Open the Vite URL printed in the terminal (usually `http://localhost:5173`).

The API listens on port `3001` by default. Set `PORT` to change it. Set `GEMINI_MODEL` to select a Gemini model.

## Workflow

1. Upload a JPG, PNG, WEBP image, or PDF (up to 10 MB).
2. For PDFs, PDF.js renders the first page to a canvas. Tesseract.js recognizes text locally in the browser; the source file is not uploaded to the extraction API.
3. Select **Read certificate** to run OCR and automatically send the recognized text to `POST /api/extract`, where Express calls Gemini and returns structured certificate fields. The raw OCR text is not shown for review.
4. Review and edit the result. Selecting **Save certificate** uploads the original file to the `Documents` bucket and saves its metadata in the `certificates` table.
5. Use **My certificates** to search the table, view/download certificate files, edit or delete records, or export all records as Excel or PDF. Both exports contain only S.No., Name, Certification, No., Organization, and Link. File links are signed URLs that expire after seven days.

This is a shared, unauthenticated library: anyone who can access the app can view, create, edit, delete, and download every certificate. The Supabase publishable/anon key is public by design; never put a service-role key in frontend environment variables. Database and bucket access policies are defined in `supabase/schema.sql`. Supabase credentials are read by `frontend/src/lib/supabase.js`.

### Create the Supabase table and sample rows

From the project root, authenticate the Supabase CLI and link this folder to your project. Get the project reference from the subdomain in `VITE_SUPABASE_URL` (the part before `.supabase.co`):

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

The link command prompts for the database password. `db:push` applies the migration in `supabase/migrations/`, creates the `Documents` bucket and access policies, then runs `supabase/seed.sql` to insert three clearly described demo rows. View them in **Supabase Dashboard → Table Editor → public → certificates**. The seed is safe to rerun; it does not duplicate its sample rows. Sample rows do not include actual certificate files.

## Production build

Run `npm run build` to create the client bundle in `dist/`. Set the environment variables on the server and run `npm start` to start the Express API. In production, serve the built client with a static web server or configure the deployment platform to serve `dist/` alongside the API.
