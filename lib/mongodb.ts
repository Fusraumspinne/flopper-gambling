import mongoose from "mongoose";

type GlobalMongoose = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var _mongoose: GlobalMongoose | undefined;
}

const globalState: GlobalMongoose = globalThis._mongoose ?? { conn: null, promise: null };
globalThis._mongoose = globalState;

export const connectMongoDB = async () => {
  if (globalState.conn) return globalState.conn;

  if (!globalState.promise) {
    const uri = process.env.MONGODB_URI as string | undefined;
    if (!uri) throw new Error("MONGODB_URI is not set");

    globalState.promise = mongoose.connect(uri).then((m) => m);
  }

  globalState.conn = await globalState.promise;
  return globalState.conn;
};