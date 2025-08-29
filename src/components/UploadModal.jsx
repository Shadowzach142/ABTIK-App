import React, { useState } from "react";
import { Upload, X } from "lucide-react";
import {
  databases,
  databaseId,
  patientsCollectionId,
  storage,
  bucketId,
} from "../appwrite";
import { Permission, Role } from "appwrite";

const scanUrl = "https://ai-tools.rev21labs.com/api/v1/vision/ocr";
const promptUrl = "https://ai-tools.rev21labs.com/api/v1/ai/prompt";
const apiKey = "OWRhY2VjODUtOTkyMi00YWI3LThjOTItM2RiMzJlYWJlYjhj";

const UploadModal = ({ setShowUploadModal }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select an image.");

    setLoading(true);

    try {
      // Step 1: OCR request
      const formData = new FormData();
      formData.append("file", file, file.name);

      const ocrResponse = await fetch(scanUrl, {
        method: "POST",
        headers: { "x-api-key": apiKey },
        body: formData,
      });

      const ocrResult = await ocrResponse.json();
      const cleanText = (ocrResult.text || "").replace(/\n/g, " ");
      setOcrText(cleanText);

      // Step 2: AI extraction
      const promptBody = {
        prompt:
          "Extract patient details and return JSON with fields: name, dateofbirth (DD/MM/YYYY), visited (DD/MM/YYYY), summary (brief symptoms/notes). If missing, set to null.",
        content: cleanText,
        expected_output: {
          name: "",
          dateofbirth: "",
          visited: "",
          summary: "",
        },
      };

      const promptResponse = await fetch(promptUrl, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(promptBody),
      });

      const extracted = await promptResponse.json();
      setExtractedData(extracted); // ✅ show preview before upload

      // Step 3: Upload image to Appwrite Storage
      const uploadedFile = await storage.createFile(bucketId, "unique()", file);

      // Step 4: Get file view URL (works on free plan)
      const fileUrl = storage.getFileView(bucketId, uploadedFile.$id);
      setUploadedUrl(fileUrl);

      // Step 5: Save patient record in database
      const patientData = {
        name: extracted.name || "Unknown",
        dateofbirth: extracted.dateofbirth || null,
        visited: extracted.visited || null,
        summary: extracted.summary || cleanText,
        image: fileUrl, // ✅ uses view URL instead of preview
      };

      await databases.createDocument(
        databaseId,
        patientsCollectionId,
        "unique()",
        patientData,
        [Permission.read(Role.any())]
      );

      alert("Patient record uploaded successfully!");
      setFile(null);
      setOcrText("");
      setUploadedUrl(null);
      // ⚡ keep extractedData visible until user closes modal
    } catch (error) {
      console.error("Error uploading record:", error);
      alert(
        "Upload failed. Check your network, Appwrite endpoint, and API key. See console."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Upload Medical Forms</h2>
          <button
            onClick={() => {
              setExtractedData(null); // clear when closing
              setShowUploadModal(false);
            }}
            className="close-button"
          >
            <X size={24} />
          </button>
        </div>

        <div
          className="upload-area"
          onClick={() => document.getElementById("file-upload").click()}
          style={{ cursor: "pointer" }}
        >
          <Upload className="upload-icon" />
          <p className="upload-text">
            Click or drag-and-drop your scanned forms here
          </p>
        </div>

        <input
          type="file"
          accept="image/*"
          id="file-upload"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {file && <p>Selected file: {file.name}</p>}
        {loading && <p>Processing image and uploading...</p>}

        {ocrText && (
          <div>
            <h4>OCR Text Preview:</h4>
            <pre>{ocrText}</pre>
          </div>
        )}

        {extractedData && (
          <div>
            <h4>Extracted Data:</h4>
            <pre>{JSON.stringify(extractedData, null, 2)}</pre>
          </div>
        )}

        {uploadedUrl && (
          <div>
            <h4>Uploaded Image Preview:</h4>
            <img
              src={uploadedUrl}
              alt="Uploaded scan"
              style={{ maxWidth: "100%", borderRadius: "8px" }}
            />
          </div>
        )}

        <div className="modal-actions">
          <button
            onClick={() => {
              setExtractedData(null);
              setShowUploadModal(false);
            }}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button onClick={handleUpload} className="btn btn-primary">
            Upload & Process
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
