#![no_std]

mod errors;
mod events;
mod types;

use soroban_sdk::{contract, contractimpl, vec, Address, Bytes, BytesN, Env, Vec};

pub use errors::Error;
pub use types::{
    Channel, ChannelKind, DataKey, MAX_ADMINS, MAX_PAYLOAD_BYTES, TTL_EXTEND_TO, TTL_THRESHOLD,
};

#[contract]
pub struct ChannelsContract;

fn load_channel(env: &Env, id: u64) -> Result<Channel, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Channel(id))
        .ok_or(Error::ChannelNotFound)
}

fn save_channel(env: &Env, id: u64, channel: &Channel) {
    let key = DataKey::Channel(id);
    env.storage().persistent().set(&key, channel);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Loads an open channel and requires `admin` (one signature, D4) to be one
/// of its stored admins.
fn open_channel_for_admin(env: &Env, id: u64, admin: &Address) -> Result<Channel, Error> {
    let channel = load_channel(env, id)?;
    if channel.closed {
        return Err(Error::ChannelClosed);
    }
    if !channel.admins.contains(admin) {
        return Err(Error::NotAdmin);
    }
    admin.require_auth();
    Ok(channel)
}

/// Loads an open channel and checks a threshold action (D4): `signers` must be
/// deduplicated, every one a stored admin (never trusted from the argument),
/// at least `threshold` of them, and each must authorize.
fn open_channel_for_threshold(
    env: &Env,
    id: u64,
    signers: &Vec<Address>,
) -> Result<Channel, Error> {
    let channel = load_channel(env, id)?;
    if channel.closed {
        return Err(Error::ChannelClosed);
    }
    // Bounds the quadratic duplicate check below.
    if signers.len() > MAX_ADMINS {
        return Err(Error::TooManyAdmins);
    }
    for (i, signer) in signers.iter().enumerate() {
        if signers.iter().skip(i + 1).any(|other| other == signer) {
            return Err(Error::DuplicateSigner);
        }
        if !channel.admins.contains(&signer) {
            return Err(Error::NotAdmin);
        }
    }
    if signers.len() < channel.threshold {
        return Err(Error::Unauthorized);
    }
    for signer in signers.iter() {
        signer.require_auth();
    }
    Ok(channel)
}

fn valid_threshold(threshold: u32, admins: u32) -> bool {
    threshold >= 1 && threshold <= admins
}

/// Closed channels reject every mutation, including admin changes.
#[contractimpl]
impl ChannelsContract {
    /// D9 (v1): code upgrades are author-only. `upgrader` is fixed at deploy
    /// time and can sign `upgrade` alone, with no notice period. Moving to a
    /// multisig plus notice period is a later, announced change.
    pub fn __constructor(env: Env, upgrader: Address) {
        env.storage().instance().set(&DataKey::Upgrader, &upgrader);
    }

    pub fn upgrader(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Upgrader)
            .expect("constructor sets the upgrader")
    }

    /// Replaces the contract code. Requires the stored upgrader's auth.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        Self::upgrader(env.clone()).require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn version(_env: Env) -> u32 {
        1
    }

    /// Creator becomes the first admin (threshold 1). Requires creator auth.
    pub fn create_channel(env: Env, creator: Address, kind: ChannelKind) -> Result<u64, Error> {
        creator.require_auth();
        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        env.storage().instance().set(
            &DataKey::NextId,
            &id.checked_add(1).ok_or(Error::TooManyAdmins)?,
        );
        extend_instance(&env);
        let channel = Channel {
            kind,
            admins: vec![&env, creator.clone()],
            threshold: 1,
            closed: false,
        };
        save_channel(&env, id, &channel);
        events::ChannelCreated {
            channel_id: id,
            admin: creator,
        }
        .publish(&env);
        Ok(id)
    }

    /// 1 admin or 1 publisher. Rejects closed channels, empty payloads and
    /// payloads larger than `MAX_PAYLOAD_BYTES`.
    pub fn publish(
        env: Env,
        channel_id: u64,
        signer: Address,
        payload: Bytes,
    ) -> Result<(), Error> {
        signer.require_auth();
        let channel = load_channel(&env, channel_id)?;
        if channel.closed {
            return Err(Error::ChannelClosed);
        }
        if payload.is_empty() {
            return Err(Error::InvalidPayload);
        }
        if payload.len() > MAX_PAYLOAD_BYTES {
            return Err(Error::PayloadTooLarge);
        }
        if !channel.admins.contains(&signer) {
            let key = DataKey::Publisher(channel_id, signer.clone());
            if !env.storage().persistent().has(&key) {
                return Err(Error::Unauthorized);
            }
            // Keep an active publisher's grant alive as long as it is used.
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        env.storage().persistent().extend_ttl(
            &DataKey::Channel(channel_id),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
        events::MessagePublished {
            channel_id,
            publisher: signer,
            payload,
        }
        .publish(&env);
        Ok(())
    }

    /// 1 admin. Delegated keys only publish.
    pub fn add_publisher(
        env: Env,
        channel_id: u64,
        admin: Address,
        publisher: Address,
    ) -> Result<(), Error> {
        open_channel_for_admin(&env, channel_id, &admin)?;
        let key = DataKey::Publisher(channel_id, publisher.clone());
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        events::PublisherAdded {
            channel_id,
            publisher,
        }
        .publish(&env);
        Ok(())
    }

    /// 1 admin. Does not affect admins, who publish by being admins.
    pub fn remove_publisher(
        env: Env,
        channel_id: u64,
        admin: Address,
        publisher: Address,
    ) -> Result<(), Error> {
        open_channel_for_admin(&env, channel_id, &admin)?;
        env.storage()
            .persistent()
            .remove(&DataKey::Publisher(channel_id, publisher.clone()));
        events::PublisherRemoved {
            channel_id,
            publisher,
        }
        .publish(&env);
        Ok(())
    }

    /// Channel threshold. At most `MAX_ADMINS` admins.
    pub fn add_admin(
        env: Env,
        channel_id: u64,
        signers: Vec<Address>,
        new_admin: Address,
    ) -> Result<(), Error> {
        let mut channel = open_channel_for_threshold(&env, channel_id, &signers)?;
        if channel.admins.contains(&new_admin) {
            return Err(Error::AlreadyAdmin);
        }
        if channel.admins.len() >= MAX_ADMINS {
            return Err(Error::TooManyAdmins);
        }
        channel.admins.push_back(new_admin.clone());
        save_channel(&env, channel_id, &channel);
        events::AdminAdded {
            channel_id,
            admin: new_admin,
        }
        .publish(&env);
        Ok(())
    }

    /// Channel threshold. Must not remove the last admin or leave
    /// `threshold > admins.len()`.
    pub fn remove_admin(
        env: Env,
        channel_id: u64,
        signers: Vec<Address>,
        admin: Address,
    ) -> Result<(), Error> {
        let mut channel = open_channel_for_threshold(&env, channel_id, &signers)?;
        let index = channel
            .admins
            .first_index_of(&admin)
            .ok_or(Error::NotAdmin)?;
        if channel.admins.len() == 1 {
            return Err(Error::LastAdmin);
        }
        if channel.threshold > channel.admins.len() - 1 {
            return Err(Error::InvalidThreshold);
        }
        channel.admins.remove(index);
        save_channel(&env, channel_id, &channel);
        events::AdminRemoved { channel_id, admin }.publish(&env);
        Ok(())
    }

    /// Channel threshold. `1 <= threshold <= admins.len()`.
    pub fn set_threshold(
        env: Env,
        channel_id: u64,
        signers: Vec<Address>,
        threshold: u32,
    ) -> Result<(), Error> {
        let mut channel = open_channel_for_threshold(&env, channel_id, &signers)?;
        if !valid_threshold(threshold, channel.admins.len()) {
            return Err(Error::InvalidThreshold);
        }
        channel.threshold = threshold;
        save_channel(&env, channel_id, &channel);
        events::ThresholdChanged {
            channel_id,
            threshold,
        }
        .publish(&env);
        Ok(())
    }

    /// Channel threshold. Replaces the admin set and threshold atomically.
    /// Publisher grants are kept (they cannot be enumerated); new admins
    /// should review them.
    pub fn transfer_channel(
        env: Env,
        channel_id: u64,
        signers: Vec<Address>,
        new_admins: Vec<Address>,
        new_threshold: u32,
    ) -> Result<(), Error> {
        let mut channel = open_channel_for_threshold(&env, channel_id, &signers)?;
        if new_admins.is_empty() {
            return Err(Error::LastAdmin);
        }
        if new_admins.len() > MAX_ADMINS {
            return Err(Error::TooManyAdmins);
        }
        for (i, admin) in new_admins.iter().enumerate() {
            if new_admins.iter().skip(i + 1).any(|other| other == admin) {
                return Err(Error::DuplicateSigner);
            }
        }
        if !valid_threshold(new_threshold, new_admins.len()) {
            return Err(Error::InvalidThreshold);
        }
        channel.admins = new_admins;
        channel.threshold = new_threshold;
        save_channel(&env, channel_id, &channel);
        events::ChannelTransferred { channel_id }.publish(&env);
        Ok(())
    }

    /// Channel threshold. Closed channels reject `publish` and every other
    /// mutation; closing is final.
    pub fn close_channel(env: Env, channel_id: u64, signers: Vec<Address>) -> Result<(), Error> {
        let mut channel = open_channel_for_threshold(&env, channel_id, &signers)?;
        channel.closed = true;
        save_channel(&env, channel_id, &channel);
        events::ChannelClosed { channel_id }.publish(&env);
        Ok(())
    }

    pub fn get_channel(env: Env, channel_id: u64) -> Result<Channel, Error> {
        load_channel(&env, channel_id)
    }
}

#[cfg(test)]
mod test;
