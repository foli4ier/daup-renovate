import { Navigate, Route, Routes } from "react-router-dom";
import { copy } from "./copy";
import { TabBar } from "./components/Chrome";
import { useRenovate } from "./state/store";
import Budget from "./pages/Budget";
import Callout from "./pages/Callout";
import Capture from "./pages/Capture";
import Chat, { QuestionsRedirect } from "./pages/Chat";
import Gallery from "./pages/Gallery";
import Home from "./pages/Home";
import Properties from "./pages/Properties";
import Work from "./pages/Work";
import Zones from "./pages/Zones";

export default function App() {
  const { state, saveFailed, houseSaveFailed } = useRenovate();
  return (
    <div className="shell">
      <div className="brand-strip" aria-hidden="true" />
      {state.sample ? <p className="sample-banner">{copy.sampleBanner}</p> : null}
      {houseSaveFailed || saveFailed ? (
        <p className="warn save-failed">{houseSaveFailed ? copy.houseSaveFailed : copy.saveFailed}</p>
      ) : null}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/plan" element={<Zones />} />
        <Route path="/you" element={<Navigate to="/budget" replace />} />
        <Route path="/zone/:zoneId" element={<Capture />} />
        <Route path="/zone/:zoneId/chat" element={<Chat />} />
        <Route path="/zone/:zoneId/questions" element={<QuestionsRedirect />} />
        <Route path="/gallery/:zoneId" element={<Gallery />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/work" element={<Work />} />
        <Route path="/callout" element={<Callout />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </div>
  );
}
