#![no_std]

#[allow(dead_code)]
mod errors;
#[allow(dead_code)]
mod events;
#[allow(dead_code)]
mod types;

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Vec};

pub use errors::Error;
pub use types::{Channel, ChannelKind, DataKey, MAX_ADMINS, MAX_PAYLOAD_BYTES};

#[contract]
pub struct ChannelsContract;

/// Architecture skeleton: signatures follow the D4 authorization matrix.
/// Every method returns `Error::NotImplemented` until implemented.
///
/// Implementation rules (see docs/architecture.md):
/// - `signers` must be deduplicated, checked against the admins loaded from
///   storage (never trusted from the argument), and each must `require_auth()`.
/// - Threshold actions need `signers.len() >= channel.threshold`.
/// - Extend the TTL of `Channel(id)` on every write and on `publish`.
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
    pub fn create_channel(_env: Env, _creator: Address, _kind: ChannelKind) -> Result<u64, Error> {
        Err(Error::NotImplemented)
    }

    /// 1 admin or 1 publisher. Rejects closed channels and payloads larger
    /// than `MAX_PAYLOAD_BYTES`.
    pub fn publish(
        _env: Env,
        _channel_id: u64,
        _signer: Address,
        _payload: Bytes,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// 1 admin.
    pub fn add_publisher(
        _env: Env,
        _channel_id: u64,
        _admin: Address,
        _publisher: Address,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// 1 admin.
    pub fn remove_publisher(
        _env: Env,
        _channel_id: u64,
        _admin: Address,
        _publisher: Address,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// Channel threshold. At most `MAX_ADMINS` admins.
    pub fn add_admin(
        _env: Env,
        _channel_id: u64,
        _signers: Vec<Address>,
        _new_admin: Address,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// Channel threshold. Must not remove the last admin or leave
    /// `threshold > admins.len()`.
    pub fn remove_admin(
        _env: Env,
        _channel_id: u64,
        _signers: Vec<Address>,
        _admin: Address,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// Channel threshold. `1 <= threshold <= admins.len()`.
    pub fn set_threshold(
        _env: Env,
        _channel_id: u64,
        _signers: Vec<Address>,
        _threshold: u32,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// Channel threshold. Replaces the admin set and threshold atomically.
    pub fn transfer_channel(
        _env: Env,
        _channel_id: u64,
        _signers: Vec<Address>,
        _new_admins: Vec<Address>,
        _new_threshold: u32,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// Channel threshold. Closed channels reject `publish`.
    pub fn close_channel(_env: Env, _channel_id: u64, _signers: Vec<Address>) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    pub fn get_channel(_env: Env, _channel_id: u64) -> Result<Channel, Error> {
        Err(Error::NotImplemented)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env};

    fn setup() -> (Env, ChannelsContractClient<'static>) {
        let env = Env::default();
        let upgrader = Address::generate(&env);
        let id = env.register(ChannelsContract, (upgrader,));
        let client = ChannelsContractClient::new(&env, &id);
        (env, client)
    }

    #[test]
    fn constructor_stores_upgrader() {
        let env = Env::default();
        let upgrader = Address::generate(&env);
        let id = env.register(ChannelsContract, (upgrader.clone(),));
        let client = ChannelsContractClient::new(&env, &id);
        assert_eq!(client.upgrader(), upgrader);
    }

    #[test]
    fn upgrade_requires_upgrader_auth() {
        let (env, client) = setup();
        let hash = BytesN::from_array(&env, &[0; 32]);
        // No auth mocked: the upgrader has not signed.
        assert!(client.try_upgrade(&hash).is_err());
    }

    #[test]
    fn version_is_one() {
        let (_env, client) = setup();
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn every_stub_reports_not_implemented() {
        let (env, client) = setup();
        let who = Address::generate(&env);
        let signers = vec![&env, who.clone()];

        assert_eq!(
            client.try_create_channel(&who, &ChannelKind::Open),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_publish(&1, &who, &Bytes::new(&env)),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_add_publisher(&1, &who, &who),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_remove_publisher(&1, &who, &who),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_add_admin(&1, &signers, &who),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_remove_admin(&1, &signers, &who),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_set_threshold(&1, &signers, &1),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_transfer_channel(&1, &signers, &signers, &1),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(
            client.try_close_channel(&1, &signers),
            Err(Ok(Error::NotImplemented))
        );
        assert_eq!(client.try_get_channel(&1), Err(Ok(Error::NotImplemented)));
    }
}
