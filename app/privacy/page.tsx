import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Flopper Gambling",
  description: "Privacy Policy for Flopper Gambling.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  const lastUpdated = "January 25, 2026";

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-extrabold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#8399aa]">
          Last updated: {lastUpdated}
        </p>

        <div className="mt-8 space-y-6 text-[#b1bad3]">
          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">1. Who we are</h2>
            <p>
              This Privacy Policy explains how this website (“we”, “us”)
              processes personal data when you use Flopper Gambling (the
              “Service”)
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">2. Data we process</h2>
            <p>
              Depending on how you use the Service, we may process the following
              categories of data:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <span className="text-white">Account data</span>: username,
                password (stored as a hash), account creation timestamps
              </li>
              <li>
                <span className="text-white">
                  Session / authentication data
                </span>
                : authentication tokens and related cookies used to keep you
                signed in
              </li>
              <li>
                <span className="text-white">Access-gate data</span>: an “access
                granted” cookie used when the site is protected by a shared
                access password
              </li>
              <li>
                <span className="text-white">Game and wallet data</span>:
                balance, investment values/timestamps, hourly/daily reward
                timestamps, weekly payback values
              </li>
              <li>
                <span className="text-white">Leaderboard / highscore data</span>
                : username and best values such as highest profit, multiplier,
                or loss per game
              </li>
              <li>
                <span className="text-white">Gifts / transfers</span>: sender
                username, recipient username, gifted amount, timestamps
              </li>
              <li>
                <span className="text-white">Device and log data</span>: IP
                address and basic request metadata (e.g., user agent) that may
                be processed by the hosting provider and server logs
              </li>
              <li>
                <span className="text-white">Local storage preferences</span>:
                UI preferences saved in your browser (e.g., sidebar collapsed
                state, sound volume, live-stats panel position)
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">
              3. Purposes and legal bases (GDPR)
            </h2>
            <p>We process personal data for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <span className="text-white">Provide the Service</span> (account
                creation, login, gameplay, storing wallet state) — Art. 6(1)(b)
                GDPR (performance of a contract)
              </li>
              <li>
                <span className="text-white">
                  Security and abuse prevention
                </span>{" "}
                (protecting the Service, detecting misuse) — Art. 6(1)(f) GDPR
                (legitimate interests)
              </li>
              <li>
                <span className="text-white">Operate core site features</span>{" "}
                such as the access gate and remembering UI settings — Art.
                6(1)(f) GDPR (legitimate interests) and/or Art. 6(1)(b) GDPR
              </li>
              <li>
                <span className="text-white">
                  Rankings and community features
                </span>{" "}
                (leaderboards, highscores, gifts) — Art. 6(1)(b) GDPR
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">
              4. Cookies and similar technologies
            </h2>
            <p>
              We use cookies and similar technologies that are necessary to run
              the Service:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <span className="text-white">Authentication cookies</span> to
                keep you signed in
              </li>
              <li>
                <span className="text-white">Access cookie</span> (e.g.,{" "}
                <span className="font-mono">site_access</span>) to remember that
                you passed the access gate
              </li>
              <li>
                <span className="text-white">Local storage</span> to remember
                preferences such as sound volume and UI layout
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">5. Sharing of data</h2>
            <p>
              We do not sell your personal data, we may share or disclose data
              in these limited cases:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <span className="text-white">Service providers</span> (e.g.,
                hosting provider, database infrastructure) to operate the
                Service
              </li>
              <li>
                <span className="text-white">Legal obligations</span> if we are
                required to comply with law or valid legal requests
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">6. Data retention</h2>
            <p>
              We keep personal data only as long as necessary for the purposes
              described above, for example, account and wallet data is kept
              while your account exists, server logs may be retained for a
              limited period for security and debugging
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">7. Security</h2>
            <p>
              We use reasonable technical and organizational measures to protect
              data, passwords are stored using a one-way hash, no method of
              transmission or storage is 100% secure
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">
              8. Your rights (EEA/UK)
            </h2>
            <p>
              Depending on your location, you may have rights such as access,
              rectification, deletion, restriction, objection, and data
              portability, you can also lodge a complaint with a supervisory
              authority
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">9. Children</h2>
            <p>
              The Service is not intended for children, If you believe a child
              provided personal data, please contact us to remove it
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">10. Contact</h2>
            <p>
              For privacy questions or requests, contact:{" "}
              <span className="text-white">fusraumspinne69@gmail.com</span>
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-bold text-white">
              11. Private & demo use
            </h2>
            <p>
              Flopper Gambling is a private demo project, no real money can be
              used or won, the service is intended for invited users only, and
              all play is for entertainment purposes with virtual currency
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
