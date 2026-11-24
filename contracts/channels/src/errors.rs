use soroban_sdk::contracterror;

/// Error codes are public ABI: never renumber, only append.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotImplemented = 1,
    ChannelNotFound = 2,
    Unauthorized = 3,
    InvalidThreshold = 4,
    ChannelClosed = 5,
    PayloadTooLarge = 6,
    TooManyAdmins = 7,
    DuplicateSigner = 8,
    NotAdmin = 9,
    LastAdmin = 10,
    InvalidPayload = 11,
    AlreadyAdmin = 12,
    NotRestricted = 13,
}
