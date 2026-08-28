import { Route, Routes } from "react-router-dom";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { HomePage } from "@/pages/HomePage";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
