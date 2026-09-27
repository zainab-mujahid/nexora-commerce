export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <div className="card w-full max-w-sm p-6 sm:p-8">{children}</div>
    </main>
  );
}
