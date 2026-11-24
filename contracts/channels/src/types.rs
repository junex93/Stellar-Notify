use soroban_sdk::{contracttype, Address, Vec};

/// Hard caps keep loops and event sizes bounded on attacker-shaped input.
pub const MAX_ADMINS: u32 = 10;
/// Storage TTLs in ledgers (~5s each): extend to 60 days once below 30.
pub const TTL_THRESHOLD: u32 = 30 * 17_280;
pub const TTL_EXTEND_TO: u32 = 60 * 17_280;
pub const MAX_PAYLOAD_BYTES: u32 = 4096; // docs/costs.md

/// Open: anyone subscribes. Restricted: admins approve subscribers.
/// Subscriptions are never stored on-chain (principle 2 / D6).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChannelKind {
    Open,
    Restricted,
}

/// Invariants: 1 <= threshold <= admins.len() <= MAX_ADMINS; never zero admins.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Channel {
    pub kind: ChannelKind,
    pub admins: Vec<Address>,
    /// Signatures required for sensitive actions (D4). Default 1.
    pub threshold: u32,
    pub closed: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Sole address allowed to upgrade the contract code (D9, v1).
    Upgrader,
    NextId,
    Channel(u64),
    Publisher(u64, Address),
}
