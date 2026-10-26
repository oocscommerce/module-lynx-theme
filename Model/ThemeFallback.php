<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * Whether a page belongs to the checkout that Magento ships rather than the one Lynx builds
 */
class ThemeFallback
{
    private const XML_PATH_ENABLED = 'lynx_fallback/general/enabled';
    private const XML_PATH_THEME   = 'lynx_fallback/general/fallback_theme';
    private const XML_PATH_ACTIONS = 'lynx_fallback/general/actions';

    /**
     * @var bool|null
     */
    private ?bool $enabled = null;

    /**
     * @var string|null
     */
    private ?string $themeId = null;

    /**
     * @var string[]|null Route patterns from the config, parsed once.
     */
    private ?array $patterns = null;

    /**
     * Answers already given, by action name
     *
     * @var array<string, bool>
     */
    private array $matched = [];

    /**
     * Scope config
     *
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
    ) {
    }

    /**
     * The theme those pages render as, empty when the store keeps the Lynx checkout
     *
     * @return string
     */
    public function getThemeId(): string
    {
        return $this->themeId ??= trim(
            (string) $this->scopeConfig->getValue(self::XML_PATH_THEME, ScopeInterface::SCOPE_STORE)
        );
    }

    /**
     * Is Enabled
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->enabled ??= $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE);
    }

    /**
     * The switch alone
     *
     * @return bool
     */
    public function isActive(): bool
    {
        return $this->isEnabled();
    }

    /**
     * Matches
     *
     * @param string $fullActionName
     * @return bool
     */
    public function matches(string $fullActionName): bool
    {
        return $this->matched[$fullActionName] ??= $this->match($fullActionName);
    }

    /**
     * Match
     *
     * @param string $fullActionName
     * @return bool
     */
    private function match(string $fullActionName): bool
    {
        $action = strtolower($fullActionName);

        foreach ($this->getPatterns() as $pattern) {
            $pattern = strtolower((string) $pattern);

            if (str_ends_with($pattern, '*')) {
                if (str_starts_with($action, rtrim($pattern, '*'))) {
                    return true;
                }

                continue;
            }

            if ($pattern === $action) {
                return true;
            }
        }

        return false;
    }

    /**
     * The route patterns to hand back, from the Theme Fallback config
     *
     * @return string[]
     */
    private function getPatterns(): array
    {
        if ($this->patterns !== null) {
            return $this->patterns;
        }

        $raw = (string) $this->scopeConfig->getValue(self::XML_PATH_ACTIONS, ScopeInterface::SCOPE_STORE);

        return $this->patterns = array_values(array_filter(
            array_map('trim', preg_split('/\R/', $raw) ?: []),
            static fn (string $line): bool => $line !== ''
        ));
    }
}
