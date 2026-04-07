export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark" style={{ minHeight: '100vh', backgroundColor: '#0A0A0A' }}>
      {children}
    </div>
  );
}
