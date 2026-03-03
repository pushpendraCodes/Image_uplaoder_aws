// ============================================================
//  S3 Pre-Signed URL Upload Flow — Backend (Node.js + Express)
//  Tech: Express, AWS S3, MongoDB, CloudFront
// ============================================================

import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import AWS from "aws-sdk";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// ─── APP SETUP ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── MONGODB CONNECTION ─────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

connectDB();

// ─── AWS S3 CONFIGURATION ───────────────────────────────────
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// ─── MONGODB SCHEMA ─────────────────────────────────────────
const ImageSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
  },
  cloudFrontUrl: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const Image = mongoose.model("Image", ImageSchema);

// ─── ROUTE 1: GENERATE PRE-SIGNED URL ───────────────────────
app.post("/api/presigned-url", async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({
        error: "fileName and fileType are required",
      });
    }

    // Allow only images (recommended)
    const allowedTypes = ["image/jpeg", "image/png","video/mp4", "image/webp"];
    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({
        error: "Only JPEG, PNG, MP4, and WEBP files are allowed",
      });
    }

    const uniqueId = uuidv4();
    const date = new Date().toISOString().split("T")[0];
    const s3Key = `images/${date}/${uniqueId}-${fileName}`;

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
      Expires: 60 * 5, // 5 minutes
    };

    const presignedUrl = await s3.getSignedUrlPromise(
      "putObject",
      params
    );

    res.json({
      presignedUrl,
      s3Key,
    });
  } catch (error) {
    console.error("❌ Presigned URL error:", error);
    res.status(500).json({
      error: "Failed to generate presigned URL",
    });
  }
});

// ─── ROUTE 2: SAVE IMAGE METADATA ────────────────────────────
app.post("/api/images", async (req, res) => {
  try {
    const { fileName, s3Key } = req.body;

    if (!fileName || !s3Key) {
      return res.status(400).json({
        error: "fileName and s3Key are required",
      });
    }

    const cloudFrontUrl = `${process.env.CLOUDFRONT_BASE_URL}/${s3Key}`;

    const image = await Image.create({
      fileName,
      s3Key,
      cloudFrontUrl,
    });

    res.status(201).json({
      message: "Image metadata saved successfully",
      image,
    });
  } catch (error) {
    console.error("❌ Save image error:", error);
    res.status(500).json({
      error: "Failed to save image metadata",
    });
  }
});

// ─── ROUTE 3: GET ALL IMAGES ─────────────────────────────────
app.get("/api/images", async (req, res) => {
  try {
    const images = await Image.find().sort({
      uploadedAt: -1,
    });
    res.json(images);
  } catch (error) {
    console.error("❌ Fetch images error:", error);
    res.status(500).json({
      error: "Failed to fetch images",
    });
  }
});

// ─── ROUTE 4: DELETE IMAGE ───────────────────────────────────
app.delete("/api/images/:id", async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        error: "Image not found",
      });
    }

    // Delete from S3
    await s3
      .deleteObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: image.s3Key,
      })
      .promise();

    // Delete from MongoDB
    await Image.findByIdAndDelete(req.params.id);

    res.json({
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete image error:", error);
    res.status(500).json({
      error: "Failed to delete image",
    });
  }
});

app.get("/" ,(req,res)=>{
  res.send("working")
})

// ─── SERVER START ────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
