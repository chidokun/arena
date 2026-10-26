// Xuất thành file tĩnh out/version.json — UpdateWatcher so mã này với mã đã nhúng trong JS đang chạy.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ id: process.env.BUILD_ID });
}
