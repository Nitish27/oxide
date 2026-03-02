import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { storeService } from "./services/StoreService";
import { initDatabaseStoreData } from "./store/databaseStore";

async function main() {
  await storeService.init(); // runs migration on first launch
  await initDatabaseStoreData(); // load persisted data into Zustand store
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

main();
