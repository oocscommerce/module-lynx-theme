<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Block\Cms;

use Magento\Cms\Block\Page as CmsPage;
use Magento\Cms\Model\Page;

/**
 * Keeps core's CMS page block from rendering: Lynx draws the page and its breadcrumbs itself
 */
class PageMeta extends CmsPage
{
    /**
     * No breadcrumbs: the Lynx page component renders its own
     *
     * @param Page $page
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    protected function _addBreadcrumbs(Page $page) // phpcs:ignore Magento2.CodeAnalysis.EmptyBlock
    {
        // Intentionally empty
    }

    /**
     * To Html
     *
     * @return string
     */
    protected function _toHtml()
    {
        return '';
    }

    /**
     * To Html
     *
     * @return string
     */
    public function toHtml()
    {
        return '';
    }
}
