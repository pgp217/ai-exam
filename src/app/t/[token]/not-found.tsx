export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-16">
      <h1 className="text-2xl font-bold">응시 링크를 찾을 수 없습니다</h1>
      <p className="text-zinc-600">안내 메일·문자로 받은 링크를 그대로 열었는지 확인해 주세요. 계속 열리지 않으면 담당자에게 문의해 주세요.</p>
    </main>
  );
}
