import { Navigate, Route, Routes } from "react-router-dom";
import { GameLobbyPage } from "./pages/GameLobbyPage";
import { HomePage } from "./pages/HomePage";
import { MatchPage } from "./pages/MatchPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/games/:gameId" element={<GameLobbyPage />} />
      <Route path="/matches/:matchId" element={<MatchPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
