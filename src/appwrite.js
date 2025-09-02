import { Client, Databases, Query, Storage } from "appwrite";

// Initialize the Appwrite client
const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT) // Appwrite endpoint
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID); // Project ID

// Database and Storage instances
const databases = new Databases(client);
const storage = new Storage(client);

// IDs from .env
const databaseId = import.meta.env.VITE_DATABASE_ID;
const patientsCollectionId = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const recordsCollectionId = import.meta.env.VITE_RECORDS_COLLECTION_ID;
const bucketId = import.meta.env.VITE_BUCKET_ID; // ✅ Bucket ID for images

export {
  client,
  databases,
  storage,
  Query,
  databaseId,
  patientsCollectionId,
  recordsCollectionId,
  bucketId,
};