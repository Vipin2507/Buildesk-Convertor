import { TopBar } from '../components/TopBar';
import { HomeCard } from '../components/HomeCard';

export function HomePage() {
  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <TopBar />
      <main className="flex-1 overflow-auto">
        <HomeCard />
      </main>
    </div>
  );
}
