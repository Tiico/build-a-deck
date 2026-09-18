/**
 * The screens this product is used on, in one place so that no two specs invent their own idea
 * of a telephone.
 *
 * The numbers are the ones the decisions were measured at. The televisions are the two the felt's
 * gates are read at (K18, #99), the desk is the width the editor's own audits use, and the phone
 * is 390 because that is the width every phone surface in this repo is judged at — the narrowest
 * the accessibility gates name, and the one the felt was found unreadable at (#76).
 */
export type Device = { name: string; viewport: { width: number; height: number }; hasTouch?: boolean; isMobile?: boolean }

/** The big screen in the room, at the size a living room has. */
export const TV: Device = { name: 'tv', viewport: { width: 1920, height: 1080 } }
/** A laptop standing in for the television, which is the other way a group plays in one room. */
export const SMALL_TV: Device = { name: 'small-tv', viewport: { width: 1280, height: 800 } }
/** The designer's own screen. The editor is desktop-first by decision (L12). */
export const DESK: Device = { name: 'desk', viewport: { width: 1440, height: 900 } }
/**
 * The telephone in a player's hand. Touch is on, because a hand surface that only answers a
 * mouse is a hand surface that does not work — and because `hasTouch` is what makes the browser
 * dispatch pointer events of the kind the real one gets.
 */
export const PHONE: Device = { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
