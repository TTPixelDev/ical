import mongoose, { Document, Model } from 'mongoose';

export interface IICalUrl extends Document {
  uniqueId: string;
  url: string;
  summary: string;
  icalContent: string;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const iCalUrlSchema = new mongoose.Schema<IICalUrl>({
  uniqueId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  url: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    default: 'Jobb'
  },
  icalContent: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Helper to prevent "OverwriteModelError" in serverless hot-reloads
export default (mongoose.models.ICalUrl as Model<IICalUrl>) || mongoose.model<IICalUrl>('ICalUrl', iCalUrlSchema);
