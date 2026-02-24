# NestJS File Upload Service

Secure file upload system with AWS S3 integration, validation, and automatic image optimization.

## Features

- ✅ File type validation (JPEG, PNG, WebP, PDF)
- ✅ File size limit (10MB max)
- ✅ Magic number validation (prevents file type spoofing)
- ✅ AWS S3 storage with signed URLs
- ✅ Automatic thumbnail generation for profile pictures
- ✅ File metadata storage in PostgreSQL
- ✅ Secure file access with expiring URLs

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your AWS and database credentials
```

3. Run the application:

```bash
npm run start:dev
```

## API Endpoints

### Upload File

```bash
POST /api/v1/upload
Content-Type: multipart/form-data

Fields:
- file: File to upload
- fileType: profile_picture | group_image | document
- userId: (optional) User identifier
```

Example:

```bash
curl -X POST http://localhost:3000/api/v1/upload \
  -F "file=@profile.jpg" \
  -F "fileType=profile_picture" \
  -F "userId=user123"
```

### Get Signed URL

```bash
GET /api/v1/upload/:id/signed-url?expiresIn=3600
```

### Get File Metadata

```bash
GET /api/v1/upload/:id
```

## Security Features

- File type validation using MIME type and magic numbers
- Size limits enforced at multiple levels
- Signed URLs with configurable expiration
- Content-Type validation
- Secure S3 bucket configuration required

## Image Optimization

Profile pictures automatically generate 200x200 thumbnails with:

- Center crop fitting
- JPEG compression (80% quality)
- Stored separately in S3

## Database Schema

```sql
file_metadata:
- id (uuid)
- filename (string)
- originalName (string)
- mimeType (string)
- size (number)
- url (string)
- thumbnailUrl (string, nullable)
- storageKey (string)
- uploadedBy (string)
- createdAt (timestamp)
```
