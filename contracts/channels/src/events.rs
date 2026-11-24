use soroban_sdk::{contractevent, Address, Bytes, BytesN};

/// Topics: ("msg", channel_id). Payload is opaque; private content must be
/// encrypted by the sender.
#[contractevent(topics = ["msg"])]
pub struct MessagePublished {
    #[topic]
    pub channel_id: u64,
    pub publisher: Address,
    pub payload: Bytes,
}

#[contractevent(topics = ["created"])]
pub struct ChannelCreated {
    #[topic]
    pub channel_id: u64,
    pub admin: Address,
}

/// Admin-set changes are announced to subscribers (README principle 3).
#[contractevent(topics = ["admin_add"])]
pub struct AdminAdded {
    #[topic]
    pub channel_id: u64,
    pub admin: Address,
}

#[contractevent(topics = ["admin_rm"])]
pub struct AdminRemoved {
    #[topic]
    pub channel_id: u64,
    pub admin: Address,
}

#[contractevent(topics = ["threshold"])]
pub struct ThresholdChanged {
    #[topic]
    pub channel_id: u64,
    pub threshold: u32,
}

#[contractevent(topics = ["pub_add"])]
pub struct PublisherAdded {
    #[topic]
    pub channel_id: u64,
    pub publisher: Address,
}

#[contractevent(topics = ["pub_rm"])]
pub struct PublisherRemoved {
    #[topic]
    pub channel_id: u64,
    pub publisher: Address,
}

#[contractevent(topics = ["transferred"])]
pub struct ChannelTransferred {
    #[topic]
    pub channel_id: u64,
}

#[contractevent(topics = ["closed"])]
pub struct ChannelClosed {
    #[topic]
    pub channel_id: u64,
}

/// `id` is an opaque salted commitment, never a wallet address.
#[contractevent(topics = ["sub_ok"])]
pub struct SubscriberApproved {
    #[topic]
    pub channel_id: u64,
    pub id: BytesN<32>,
}

#[contractevent(topics = ["sub_rm"])]
pub struct SubscriberRemoved {
    #[topic]
    pub channel_id: u64,
    pub id: BytesN<32>,
}
