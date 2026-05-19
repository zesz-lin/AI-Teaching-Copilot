import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
