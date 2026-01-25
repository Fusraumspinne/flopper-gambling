"use client"

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignUpForm() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [accepted, setAccepted] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()

    if(!name || !password){
      setError("Please provide a username and password.");
      return
    }

    if(!accepted){
      setError("Please confirm the declaration to register.");
      return
    }

    try{
      const res = await fetch("api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }, body: JSON.stringify({
          name, password
        })
      })

      if(res.ok){
        const form = e.target
        form.reset()
        router.push("/login")
      } else {
        setError("Signup failed. That username may already be taken.");
      }
    } catch (err){
      setError("An error occurred during signup. Please try again later.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#213743] rounded-2xl border border-[#2f4553]/60 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold bg-linear-to-r from-indigo-400 via-pink-400 to-yellow-300 bg-clip-text text-transparent mb-2">
            Create Account
          </h1>
          <p className="text-[#b1bad3]">Join Flopper Gambling today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-[#b1bad3] mb-2">Choose Username</label>
            <input 
              type="text" 
              placeholder="Pick a gambler name"
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-lg p-3 text-white focus:outline-none focus:border-pink-400 transition-colors"
                onChange={e => { setName(e.target.value); setError(""); }}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#b1bad3] mb-2">Password</label>
            <input 
              type="password" 
              placeholder="Please not 67"
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-lg p-3 text-white focus:outline-none focus:border-pink-400 transition-colors"
                onChange={e => { setPassword(e.target.value); setError(""); }}
            />
          </div>

            <div className="flex items-start gap-3">
              <input
                id="terms"
                type="checkbox"
                checked={accepted}
                onChange={e => { setAccepted(e.target.checked); setError(""); }}
                className="mt-1 h-4 w-4 rounded border-[#2f4553] bg-[#0f212e] text-pink-400 focus:ring-pink-400"
              />
              <label htmlFor="terms" className="text-xs text-[#b1bad3]">
                I confirm that this platform is a private demo project using only virtual currency, no real money can be deposited or real prizes won, use of this platform is at your own risk, there is no guarantee of availability, error-free operation, data integrity, or preservation of game progress, I am at least 18 years old and understand that this does not constitute gambling under applicable laws
              </label>
            </div>

            {error && (
              <p className="text-sm text-[#ffb4b4]">{error}</p>
            )}

          <button className="w-full py-3 px-4 bg-pink-500 hover:bg-pink-600 text-white font-bold rounded-lg transition-all duration-200 transform hover:scale-[1.02] mt-4">
            Get Started
          </button>
          <div className="text-sm">
            Multiple accounts are not allowed, be fair to others
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-[#557086]">
          Already have an account?{" "}
          <Link href="/login" className="text-pink-400 hover:underline">Login</Link>
        </p>
      </div>
    </div>
  );
}