"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginForm() {  
  const router = useRouter();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!name || !password) {
      return;
    }

    try {
      const res = await signIn("credentials", {
        name, password, redirect: false
      })

      if(res?.error){
        console.log("Invalid data")
        return
      }

      router.push("/")
    } catch (err) {
      console.log("Error while loging in")
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#213743] rounded-2xl border border-[#2f4553]/60 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold bg-linear-to-r from-indigo-400 via-pink-400 to-yellow-300 bg-clip-text text-transparent mb-2">
            Welcome Back
          </h1>
          <p className="text-[#b1bad3]">Enter your details to start playing</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[#b1bad3] mb-2">
              Username
            </label>
            <input
              type="text"
              placeholder="Username"
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-lg p-3 text-white focus:outline-none focus:border-indigo-400 transition-colors"
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#b1bad3] mb-2">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-lg p-3 text-white focus:outline-none focus:border-indigo-400 transition-colors"
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button className="w-full py-3 px-4 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg transition-all duration-200 transform hover:scale-[1.02] mt-4">
            Login
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#557086]">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
