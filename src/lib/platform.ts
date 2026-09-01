/** ショートカット表示をOSごとに変える(Mac: ⌘/⌃⇧、その他: Ctrl)ために使う判定。 */
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
