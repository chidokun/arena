"use client";

import { useState } from "react";
import { AVATARS, cleanName, COLORS, randomProfile, type Profile } from "@/lib/identity";
import { Avatar } from "./Avatar";
import { Dialog } from "./Dialog";
import { useNet } from "./NetProvider";

export function ProfileButton() {
  const { profile, fresh, setProfile } = useNet();
  const [opened, setOpened] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  // Lần đầu ghé: tự mời chọn tên & avatar (một lần).
  const open = opened || (fresh && !welcomed);
  const setOpen = (v: boolean) => {
    setOpened(v);
    if (!v) setWelcomed(true);
  };

  if (!profile) return <span className="h-10 w-10 animate-pulse rounded-full bg-sunken" aria-hidden="true" />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 hover:bg-sunken sm:pr-3"
        title="Đổi tên & avatar"
      >
        <Avatar p={profile} size={34} />
        <span className="hidden max-w-[140px] truncate text-[14.5px] font-bold sm:inline">{profile.name}</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={fresh ? "Chào mừng tới Arena!" : "Hồ sơ của bạn"}>
        {open && (
          <ProfileForm
            initial={profile}
            onSave={(p) => {
              setProfile(p);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function ProfileForm({ initial, onSave }: { initial: Profile; onSave: (p: Profile) => void }) {
  const [p, setP] = useState(initial);
  const name = cleanName(p.name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name) onSave({ ...p, name });
      }}
      className="grid gap-5"
    >
      <p className="text-[14.5px] text-ink-2">Không cần đăng ký — tên và avatar chỉ lưu trên trình duyệt này và hiện cho người chơi cùng phòng.</p>
      <div className="flex items-center gap-4">
        <Avatar p={p} size={64} className="bob" />
        <div className="flex-1">
          <label htmlFor="pf-name" className="mb-1.5 block text-sm font-bold">
            Tên hiển thị
          </label>
          <input id="pf-name" className="field" value={p.name} maxLength={24} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="nickname" />
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Avatar</legend>
        <div className="grid grid-cols-9 gap-1.5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setP({ ...p, avatar: a })}
              aria-pressed={p.avatar === a}
              className={`grid aspect-square place-items-center rounded-xl text-2xl ${p.avatar === a ? "bg-pen-soft ring-2 ring-pen" : "hover:bg-sunken"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Màu nền</legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setP({ ...p, color: c })}
              aria-pressed={p.color === c}
              aria-label={`Màu ${c}`}
              className={`h-9 w-9 rounded-full border-2 border-edge ${p.color === c ? "ring-3 ring-pen ring-offset-2 ring-offset-surface" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" className="btn btn-ghost" onClick={() => setP(randomProfile())}>
          🎲 Ngẫu nhiên
        </button>
        <button type="submit" className="btn btn-pen" disabled={!name}>
          Lưu & chơi thôi
        </button>
      </div>
    </form>
  );
}
