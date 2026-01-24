import React from "react";
import ReactDOM from "react-dom/client";
import Viewer from "./Viewer";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Viewer />
    </React.StrictMode>,
  );
}
