import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import SignUpForm from "./SignUpForm";

async function page() {
 const session = await getServerSession(authOptions)

  if(session) redirect("/")

  return (
    <SignUpForm/>
  )
}

export default page
