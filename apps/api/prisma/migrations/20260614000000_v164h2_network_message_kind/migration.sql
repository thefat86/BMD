-- V164.H2 — Ajout du kind NETWORK_MESSAGE pour les messages envoyés par
-- les ambassadeurs/commerciaux à leurs filleuls directs.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'NETWORK_MESSAGE';
