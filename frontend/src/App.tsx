import { BrowserRouter, Route, Routes } from "react-router-dom";
import WorkspacePage from "./pages/WorkspacePage";

// Auth routes (login) are added in Phase 1 alongside the backend login
// endpoint — see ARCHITECTURE.md "Route structure".
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WorkspacePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
