import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import "./base.css";
// Shared button styling - several components render
// <button data-component="Button">, so it is loaded once here.
import "./styles/Button.scss";

ReactDOM.createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
