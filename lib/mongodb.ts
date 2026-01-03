import mongoose from 'mongoose'

export const connectMongoDB = async () => {
    try{
        if(mongoose.connection.readyState == 0)
        {
            await mongoose.connect(process.env.MONGODB_URI as string);
            console.log("Connected to MongoDB")
        }
        else 
        {
            console.log("MongoDB connection already established")
        }
    } catch (err){
        console.log("Failed to connect to MongoDB: ", err);
    }
}