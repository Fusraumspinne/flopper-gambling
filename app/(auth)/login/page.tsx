import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import LoginForm from "./LoginForm";

async function page() {
 const session = await getServerSession(authOptions)

  if(session) redirect("/")

  return (
    <LoginForm/>
  )
}

export default page
