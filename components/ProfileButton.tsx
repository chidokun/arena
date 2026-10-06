"use client";

import { useState } from "react";
import { AVATARS, cleanName, COLORS, randomProfile, type Profile } from "@/lib/identity";
import { Avatar } from "./Avatar";
import { Dialog } from "./Dialog";
import { useNet } from "./NetProvider";

export function ProfileButton() {
  const { profile, fresh, setProfile } = useNet();
  const [opened, setOpened] = useState(false);
  // Lần đầu ghé: bắt buộc đặt tên trước khi chơi — hộp thoại không đóng được tới khi lưu.
  const open = opened || fresh;
  const setOpen = (v: boolean) => {
    if (!v && fresh) return;
    setOpened(v);
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
      <Dialog open={open} onClose={() => setOpen(false)} title={fresh ? "Chào mừng tới Arena!" : "Hồ sơ của bạn"} dismissable={!fresh}>
        {open && (
          <ProfileForm
            // Lần đầu: để trống tên, tự gõ hoặc bấm "Ngẫu nhiên".
            initial={fresh ? { ...profile, name: "" } : profile}
            fresh={fresh}
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

function ProfileForm({ initial, fresh, onSave }: { initial: Profile; fresh: boolean; onSave: (p: Profile) => void }) {
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
          <input
            id="pf-name"
            className="field"
            value={p.name}
            maxLength={24}
            required
            autoFocus={fresh}
            placeholder="Nhập tên của bạn"
            aria-describedby="pf-name-hint"
            onChange={(e) => setP({ ...p, name: e.target.value })}
            autoComplete="nickname"
          />
          <p id="pf-name-hint" className={`mt-1 text-[12.5px] font-semibold ${name ? "text-ink-3" : "text-coral"}`}>
            {name ? "Tối đa 24 ký tự." : "Bắt buộc — gõ tên hoặc bấm “🎲 Ngẫu nhiên”."}
          </p>
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
