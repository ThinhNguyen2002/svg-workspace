export function SetupError({ message }: { message: string }) {
  return (
    <section className="empty-state" style={{ marginBottom: 20 }}>
      <h2>Scanner setup required</h2>
      <p>{message}</p>
    </section>
  );
}
