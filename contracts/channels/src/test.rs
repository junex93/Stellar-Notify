extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    vec, Bytes, Env,
};

struct Fixture {
    env: Env,
    client: ChannelsContractClient<'static>,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    let upgrader = Address::generate(&env);
    let id = env.register(ChannelsContract, (upgrader,));
    let client = ChannelsContractClient::new(&env, &id);
    Fixture { env, client }
}

impl Fixture {
    fn who(&self) -> Address {
        Address::generate(&self.env)
    }

    fn payload(&self, len: u32) -> Bytes {
        let mut b = Bytes::new(&self.env);
        for _ in 0..len {
            b.push_back(b'a');
        }
        b
    }

    /// Channel with admins `a`, `b`, `c` and the given threshold.
    fn trio(&self, threshold: u32) -> (u64, Address, Address, Address) {
        let (a, b, c) = (self.who(), self.who(), self.who());
        let id = self.client.create_channel(&a, &ChannelKind::Open);
        self.client.add_admin(&id, &vec![&self.env, a.clone()], &b);
        self.client.add_admin(&id, &vec![&self.env, a.clone()], &c);
        self.client
            .set_threshold(&id, &vec![&self.env, a.clone()], &threshold);
        (id, a, b, c)
    }

    fn event_count(&self) -> usize {
        self.env.events().all().events().len()
    }
}

#[test]
fn version_is_one() {
    assert_eq!(setup().client.version(), 1);
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
    let env = Env::default();
    let id = env.register(ChannelsContract, (Address::generate(&env),));
    let client = ChannelsContractClient::new(&env, &id);
    let hash = BytesN::from_array(&env, &[0; 32]);
    // No auth mocked: the upgrader has not signed.
    assert!(client.try_upgrade(&hash).is_err());
}

#[test]
fn create_channel_assigns_monotonic_ids_and_first_admin() {
    let f = setup();
    let creator = f.who();
    let first = f.client.create_channel(&creator, &ChannelKind::Open);
    assert_eq!(f.event_count(), 1);
    let second = f.client.create_channel(&creator, &ChannelKind::Restricted);
    assert_eq!((first, second), (1, 2));

    let channel = f.client.get_channel(&second);
    assert_eq!(channel.kind, ChannelKind::Restricted);
    assert_eq!(channel.admins, vec![&f.env, creator]);
    assert_eq!(channel.threshold, 1);
    assert!(!channel.closed);
}

#[test]
fn create_channel_requires_creator_auth() {
    let env = Env::default();
    let id = env.register(ChannelsContract, (Address::generate(&env),));
    let client = ChannelsContractClient::new(&env, &id);
    let creator = Address::generate(&env);
    assert!(client
        .try_create_channel(&creator, &ChannelKind::Open)
        .is_err());
}

#[test]
fn get_channel_unknown_is_not_found() {
    assert_eq!(
        setup().client.try_get_channel(&9),
        Err(Ok(Error::ChannelNotFound))
    );
}

#[test]
fn admin_publishes_and_emits_one_event() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    f.client.publish(&id, &admin, &f.payload(10));
    assert_eq!(f.event_count(), 1);
}

#[test]
fn publish_rejects_strangers_and_unknown_channels() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    let stranger = f.who();
    assert_eq!(
        f.client.try_publish(&id, &stranger, &f.payload(1)),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        f.client.try_publish(&99, &admin, &f.payload(1)),
        Err(Ok(Error::ChannelNotFound))
    );
}

#[test]
fn publish_enforces_payload_limits() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    f.client.publish(&id, &admin, &f.payload(MAX_PAYLOAD_BYTES));
    assert_eq!(
        f.client
            .try_publish(&id, &admin, &f.payload(MAX_PAYLOAD_BYTES + 1)),
        Err(Ok(Error::PayloadTooLarge))
    );
    assert_eq!(
        f.client.try_publish(&id, &admin, &f.payload(0)),
        Err(Ok(Error::InvalidPayload))
    );
}

#[test]
fn publisher_can_publish_but_not_administer_and_revocation_keeps_admins() {
    let f = setup();
    let admin = f.who();
    let publisher = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);

    f.client.add_publisher(&id, &admin, &publisher);
    assert_eq!(f.event_count(), 1);
    f.client.publish(&id, &publisher, &f.payload(5));
    // A publisher is not an admin.
    assert_eq!(
        f.client.try_add_publisher(&id, &publisher, &f.who()),
        Err(Ok(Error::NotAdmin))
    );

    f.client.remove_publisher(&id, &admin, &publisher);
    assert_eq!(f.event_count(), 1);
    assert_eq!(
        f.client.try_publish(&id, &publisher, &f.payload(5)),
        Err(Ok(Error::Unauthorized))
    );
    // Revoking never affects admins.
    f.client.publish(&id, &admin, &f.payload(5));
    assert_eq!(f.client.get_channel(&id).admins, vec![&f.env, admin]);
}

#[test]
fn only_an_admin_manages_publishers() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    let stranger = f.who();
    assert_eq!(
        f.client.try_add_publisher(&id, &stranger, &stranger),
        Err(Ok(Error::NotAdmin))
    );
    assert_eq!(
        f.client.try_remove_publisher(&id, &stranger, &stranger),
        Err(Ok(Error::NotAdmin))
    );
}

#[test]
fn threshold_actions_need_enough_distinct_stored_admins() {
    let f = setup();
    let (id, a, b, _c) = f.trio(2);
    let outsider = f.who();
    let target = f.who();

    // One signature is below the threshold of 2.
    assert_eq!(
        f.client
            .try_add_admin(&id, &vec![&f.env, a.clone()], &target),
        Err(Ok(Error::Unauthorized))
    );
    // The same admin twice does not count twice.
    assert_eq!(
        f.client
            .try_add_admin(&id, &vec![&f.env, a.clone(), a.clone()], &target),
        Err(Ok(Error::DuplicateSigner))
    );
    // A non-admin in the list is rejected even if the count is enough.
    assert_eq!(
        f.client
            .try_add_admin(&id, &vec![&f.env, a.clone(), outsider], &target),
        Err(Ok(Error::NotAdmin))
    );
    f.client.add_admin(&id, &vec![&f.env, a, b], &target);
    assert_eq!(f.event_count(), 1);
    assert_eq!(f.client.get_channel(&id).admins.len(), 4);
}

#[test]
fn threshold_signers_must_actually_authorize() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    // Drop the mocked authorizations: the admin has not signed.
    f.env.set_auths(&[]);
    assert!(f
        .client
        .try_close_channel(&id, &vec![&f.env, admin])
        .is_err());
}

#[test]
fn add_admin_guards() {
    let f = setup();
    let (id, a, ..) = f.trio(1);
    let signers = vec![&f.env, a.clone()];
    assert_eq!(
        f.client.try_add_admin(&id, &signers, &a),
        Err(Ok(Error::AlreadyAdmin))
    );
    for _ in 0..(MAX_ADMINS - 3) {
        f.client.add_admin(&id, &signers, &f.who());
    }
    assert_eq!(
        f.client.try_add_admin(&id, &signers, &f.who()),
        Err(Ok(Error::TooManyAdmins))
    );
}

#[test]
fn last_admin_cannot_be_removed() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    assert_eq!(
        f.client
            .try_remove_admin(&id, &vec![&f.env, admin.clone()], &admin),
        Err(Ok(Error::LastAdmin))
    );
}

#[test]
fn remove_admin_must_keep_threshold_reachable() {
    let f = setup();
    let (id, a, b, c) = f.trio(3);
    let all = vec![&f.env, a.clone(), b, c.clone()];
    // 3 of 3 required: dropping to 2 admins would make it unreachable.
    assert_eq!(
        f.client.try_remove_admin(&id, &all, &c),
        Err(Ok(Error::InvalidThreshold))
    );
    f.client.set_threshold(&id, &all, &2);
    f.client.remove_admin(
        &id,
        &vec![
            &f.env,
            a.clone(),
            f.client.get_channel(&id).admins.get(1).unwrap(),
        ],
        &c,
    );
    assert_eq!(f.event_count(), 1);
    assert_eq!(f.client.get_channel(&id).admins.len(), 2);
    assert_eq!(
        f.client.try_remove_admin(
            &id,
            &vec![
                &f.env,
                a.clone(),
                f.client.get_channel(&id).admins.get(1).unwrap()
            ],
            &f.who()
        ),
        Err(Ok(Error::NotAdmin))
    );
}

#[test]
fn set_threshold_bounds() {
    let f = setup();
    let (id, a, ..) = f.trio(1);
    let signers = vec![&f.env, a];
    assert_eq!(
        f.client.try_set_threshold(&id, &signers, &0),
        Err(Ok(Error::InvalidThreshold))
    );
    assert_eq!(
        f.client.try_set_threshold(&id, &signers, &4),
        Err(Ok(Error::InvalidThreshold))
    );
    f.client.set_threshold(&id, &signers, &3);
    assert_eq!(f.event_count(), 1);
    assert_eq!(f.client.get_channel(&id).threshold, 3);
}

#[test]
fn transfer_replaces_admins_and_threshold_atomically() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    let signers = vec![&f.env, admin.clone()];
    let (x, y) = (f.who(), f.who());

    assert_eq!(
        f.client
            .try_transfer_channel(&id, &signers, &vec![&f.env, x.clone()], &2),
        Err(Ok(Error::InvalidThreshold))
    );
    assert_eq!(
        f.client
            .try_transfer_channel(&id, &signers, &vec![&f.env, x.clone(), x.clone()], &1),
        Err(Ok(Error::DuplicateSigner))
    );
    assert_eq!(
        f.client
            .try_transfer_channel(&id, &signers, &Vec::new(&f.env), &1),
        Err(Ok(Error::LastAdmin))
    );

    f.client
        .transfer_channel(&id, &signers, &vec![&f.env, x.clone(), y.clone()], &2);
    assert_eq!(f.event_count(), 1);
    let channel = f.client.get_channel(&id);
    assert_eq!(channel.admins, vec![&f.env, x, y]);
    assert_eq!(channel.threshold, 2);
    // The old admin is out.
    assert_eq!(
        f.client.try_publish(&id, &admin, &f.payload(1)),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn closed_channel_rejects_publish_and_every_mutation() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Open);
    let signers = vec![&f.env, admin.clone()];

    f.client.close_channel(&id, &signers);
    assert_eq!(f.event_count(), 1);
    assert!(f.client.get_channel(&id).closed);

    assert_eq!(
        f.client.try_publish(&id, &admin, &f.payload(1)),
        Err(Ok(Error::ChannelClosed))
    );
    assert_eq!(
        f.client.try_add_publisher(&id, &admin, &f.who()),
        Err(Ok(Error::ChannelClosed))
    );
    assert_eq!(
        f.client.try_add_admin(&id, &signers, &f.who()),
        Err(Ok(Error::ChannelClosed))
    );
    assert_eq!(
        f.client.try_close_channel(&id, &signers),
        Err(Ok(Error::ChannelClosed))
    );
}

#[test]
fn restricted_channel_subscriber_approval_lifecycle() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Restricted);
    let sub = BytesN::from_array(&f.env, &[7; 32]);
    let other = BytesN::from_array(&f.env, &[8; 32]);

    assert!(!f.client.is_approved(&id, &sub));
    f.client.approve_subscriber(&id, &admin, &sub);
    assert_eq!(f.event_count(), 1);
    assert!(f.client.is_approved(&id, &sub));
    assert!(!f.client.is_approved(&id, &other));

    f.client.remove_subscriber(&id, &admin, &sub);
    assert_eq!(f.event_count(), 1);
    assert!(!f.client.is_approved(&id, &sub));
}

#[test]
fn subscriber_approval_is_admin_only_and_restricted_only() {
    let f = setup();
    let admin = f.who();
    let sub = BytesN::from_array(&f.env, &[7; 32]);
    let restricted = f.client.create_channel(&admin, &ChannelKind::Restricted);
    let open = f.client.create_channel(&admin, &ChannelKind::Open);
    let stranger = f.who();

    assert_eq!(
        f.client
            .try_approve_subscriber(&restricted, &stranger, &sub),
        Err(Ok(Error::NotAdmin))
    );
    assert_eq!(
        f.client.try_remove_subscriber(&restricted, &stranger, &sub),
        Err(Ok(Error::NotAdmin))
    );
    // A publisher is not an admin either.
    let publisher = f.who();
    f.client.add_publisher(&restricted, &admin, &publisher);
    assert_eq!(
        f.client
            .try_approve_subscriber(&restricted, &publisher, &sub),
        Err(Ok(Error::NotAdmin))
    );
    assert_eq!(
        f.client.try_approve_subscriber(&open, &admin, &sub),
        Err(Ok(Error::NotRestricted))
    );
    assert_eq!(
        f.client.try_remove_subscriber(&open, &admin, &sub),
        Err(Ok(Error::NotRestricted))
    );
    assert_eq!(
        f.client.try_approve_subscriber(&99, &admin, &sub),
        Err(Ok(Error::ChannelNotFound))
    );
}

#[test]
fn closed_restricted_channel_rejects_subscriber_changes() {
    let f = setup();
    let admin = f.who();
    let id = f.client.create_channel(&admin, &ChannelKind::Restricted);
    f.client.close_channel(&id, &vec![&f.env, admin.clone()]);
    let sub = BytesN::from_array(&f.env, &[7; 32]);
    assert_eq!(
        f.client.try_approve_subscriber(&id, &admin, &sub),
        Err(Ok(Error::ChannelClosed))
    );
}
