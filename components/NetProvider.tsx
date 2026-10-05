"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadProfile, resolveUid, saveProfile, type Profile } from "@/lib/identity";
import { Lobby, type LobbyView, type Where } from "@/lib/net/lobby";

type Net = {
  uid: string;
  profile: Profile | null;
  fresh: boolean;
  lobby: Lobby | null;
  setProfile: (p: Profile) => void;
};

const NetContext = createContext<Net | null>(null);

const EMPTY_VIEW: LobbyView = { connected: false, peers: 0, unreachable: 0, users: [], rooms: [] };
const noop = () => () => {};

export function NetProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState("");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [fresh, setFresh] = useState(false);
  const [lobby, setLobby] = useState<Lobby | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: Lobby | null = null;
    (async () => {
      const id = await resolveUid();
      if (cancelled) return;
      const { profile: p, fresh: f } = loadProfile();
      setProfileState(p);
      setFresh(f);
      setUid(id);
      const l = await Lobby.open(id, p);
      if (cancelled) {
        l.close();
        return;
      }
      opened = l;
      setLobby(l);
    })();
    const bye = () => opened?.goodbye();
    window.addEventListener("pagehide", bye);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", bye);
      opened?.close();
    };
  }, []);

  const setProfile = useCallback(
    (p: Profile) => {
      saveProfile(p);
      setProfileState(p);
      setFresh(false);
      lobby?.setProfile(p);
    },
    [lobby],
  );

  const value = useMemo(() => ({ uid, profile, fresh, lobby, setProfile }), [uid, profile, fresh, lobby, setProfile]);
  return <NetContext.Provider value={value}>{children}</NetContext.Provider>;
}

export function useNet() {
  const ctx = useContext(NetContext);
  if (!ctx) throw new Error("useNet phải nằm trong NetProvider");
  return ctx;
}

export function useLobbyView(): LobbyView {
  const { lobby } = useNet();
  return useSyncExternalStore(
    lobby?.store.subscribe ?? noop,
    lobby?.store.get ?? (() => EMPTY_VIEW),
    () => EMPTY_VIEW,
  );
}

/** Báo cho sảnh biết mình đang ở đâu (trang game nào, phòng nào) để đếm người chơi. */
export function useWhere(where: Where) {
  const { lobby } = useNet();
  const { game, room } = where;
  useEffect(() => {
    lobby?.setWhere({ game, room });
  }, [lobby, game, room]);
}
