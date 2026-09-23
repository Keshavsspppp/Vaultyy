import { redirect } from "next/navigation";

// Logged-in users are sent to /files by the proxy; everyone else lands on login.
export default function Home() {
  redirect("/login");
}
